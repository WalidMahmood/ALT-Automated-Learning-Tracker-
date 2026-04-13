"""
RAG Engine v7.0 — ChromaDB + PostgreSQL hybrid knowledge retrieval.
==================================================================
Singleton that owns ALL RAG operations:
  - Topic knowledge indexing (PostgreSQL → ChromaDB)
  - Exact topic lookup (PostgreSQL primary)
  - Semantic topic search (ChromaDB fallback)
  - Admin wisdom retrieval (semantic)
  - Admin wisdom sync (on GlobalWisdom post_save)
"""
import logging
from typing import Optional, List, Dict, Any

from django.conf import settings

logger = logging.getLogger(__name__)


class RAGEngine:
    """Singleton ChromaDB wrapper for topic knowledge + admin wisdom."""

    _instance = None

    def __init__(self):
        import chromadb
        from chromadb.utils.embedding_functions import OllamaEmbeddingFunction

        persist_dir = str(getattr(settings, 'CHROMA_PERSIST_DIR', settings.BASE_DIR / 'chroma_db'))
        self.client = chromadb.PersistentClient(path=persist_dir)

        embed_model = getattr(settings, 'OLLAMA_EMBED_MODEL', 'nomic-embed-text')
        embed_url = getattr(settings, 'OLLAMA_BASE_URL', 'http://localhost:11434')
        self.embed_fn = OllamaEmbeddingFunction(
            model_name=embed_model,
            url=f"{embed_url}/api/embeddings",
        )
        # Override default httpx timeout (5s is too short for local Ollama)
        import httpx
        self.embed_fn._session = httpx.Client(timeout=httpx.Timeout(120.0))

        topic_collection_name = getattr(settings, 'CHROMA_TOPIC_COLLECTION', 'topic_knowledge')
        wisdom_collection_name = getattr(settings, 'CHROMA_WISDOM_COLLECTION', 'admin_wisdom')

        self.topic_collection = self.client.get_or_create_collection(
            name=topic_collection_name,
            embedding_function=self.embed_fn,
        )
        self.wisdom_collection = self.client.get_or_create_collection(
            name=wisdom_collection_name,
            embedding_function=self.embed_fn,
        )
        logger.info(
            f"RAGEngine initialized: topics={self.topic_collection.count()}, "
            f"wisdom={self.wisdom_collection.count()}"
        )

    @classmethod
    def get_instance(cls) -> 'RAGEngine':
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    # ─── Topic Knowledge Index ────────────────────────────────────────────

    def build_topic_index(self) -> int:
        """
        One-time bulk load: reads ALL TopicKnowledge rows from PostgreSQL,
        builds document strings, and upserts into ChromaDB topic_knowledge collection.
        Returns the number of documents indexed.
        """
        from apps.topics.models import TopicKnowledge

        all_knowledge = TopicKnowledge.objects.filter(is_active=True)
        count = 0
        batch_ids = []
        batch_docs = []
        batch_metas = []

        for tk in all_knowledge.iterator():
            doc_id = f"tk_{tk.roadmap_id}_{tk.section_id}_{tk.topic_name}"
            what_you_will_learn = tk.what_you_will_learn or []
            subtopics = tk.subtopics or []
            keywords = tk.validation_keywords or []

            document = (
                f"{tk.topic_name}. {tk.what_it_is} "
                f"Learning objectives: {'; '.join(what_you_will_learn)}. "
                f"Subtopics: {', '.join(subtopics)}. "
                f"Keywords: {', '.join(keywords)}"
            )

            metadata = {
                'roadmap_id': tk.roadmap_id,
                'section_id': tk.section_id,
                'topic_name': tk.topic_name,
                'difficulty': tk.difficulty,
                'benchmark_hours': float(tk.benchmark_hours),
            }

            batch_ids.append(doc_id)
            batch_docs.append(document)
            batch_metas.append(metadata)
            count += 1

            # Upsert in batches of 10 (Ollama local embedding is slow)
            if len(batch_ids) >= 10:
                self.topic_collection.upsert(
                    ids=batch_ids, documents=batch_docs, metadatas=batch_metas,
                )
                batch_ids, batch_docs, batch_metas = [], [], []

        # Final batch
        if batch_ids:
            self.topic_collection.upsert(
                ids=batch_ids, documents=batch_docs, metadatas=batch_metas,
            )

        logger.info(f"RAGEngine: Indexed {count} topic knowledge documents into ChromaDB")
        return count

    def build_topic_index_single(self, tk) -> None:
        """
        Re-index a single TopicKnowledge document after admin edit.
        Called from TopicKnowledgeView.patch() — avoids full re-index.
        """
        doc_id = f"tk_{tk.roadmap_id}_{tk.section_id}_{tk.topic_name}"
        what_you_will_learn = tk.what_you_will_learn or []
        subtopics = tk.subtopics or []
        keywords = tk.validation_keywords or []

        document = (
            f"{tk.topic_name}. {tk.what_it_is} "
            f"Learning objectives: {'; '.join(what_you_will_learn)}. "
            f"Subtopics: {', '.join(subtopics)}. "
            f"Keywords: {', '.join(keywords)}"
        )

        metadata = {
            'roadmap_id': tk.roadmap_id,
            'section_id': tk.section_id,
            'topic_name': tk.topic_name,
            'difficulty': tk.difficulty,
            'benchmark_hours': float(tk.benchmark_hours),
        }

        self.topic_collection.upsert(
            ids=[doc_id],
            documents=[document],
            metadatas=[metadata],
        )
        logger.info(f"RAGEngine: Re-indexed single doc '{tk.topic_name}' in ChromaDB")

    # ─── Topic Knowledge Retrieval ────────────────────────────────────────

    def get_exact_topic_knowledge(
        self, topic_name: str, roadmap_id: Optional[str] = None
    ) -> Optional[Any]:
        """
        PRIMARY lookup: exact PostgreSQL match.
        Returns a TopicKnowledge model instance or None.
        """
        from apps.topics.models import TopicKnowledge

        if roadmap_id:
            match = TopicKnowledge.objects.filter(
                topic_name__iexact=topic_name, roadmap_id=roadmap_id, is_active=True
            ).first()
            if match:
                return match

        # Fallback: any roadmap
        return TopicKnowledge.objects.filter(
            topic_name__iexact=topic_name, is_active=True
        ).first()

    def query_topic_knowledge(
        self,
        topic_name: str,
        entry_text: str,
        roadmap_id: Optional[str] = None,
        n: int = 3,
    ) -> List[Dict[str, Any]]:
        """
        SECONDARY lookup: semantic search from ChromaDB.
        Returns list of dicts with topic_name, what_it_is, what_you_will_learn, etc.
        """
        query_string = f"Topic: {topic_name}. Learning about: {entry_text[:300]}. Key concepts: {', '.join(entry_text.lower().split()[:20])}"

        try:
            where_filter = {"roadmap_id": roadmap_id} if roadmap_id else None
            results = self.topic_collection.query(
                query_texts=[query_string],
                n_results=n,
                where=where_filter,
            )

            if not results or not results.get('ids') or not results['ids'][0]:
                return []

            output = []
            for i, doc_id in enumerate(results['ids'][0]):
                meta = results['metadatas'][0][i] if results.get('metadatas') else {}
                distance = results['distances'][0][i] if results.get('distances') else 1.0

                # Fetch full record from PostgreSQL for complete data
                from apps.topics.models import TopicKnowledge
                tk = TopicKnowledge.objects.filter(
                    topic_name__iexact=meta.get('topic_name', ''),
                    roadmap_id=meta.get('roadmap_id', ''),
                    is_active=True,
                ).first()

                if tk:
                    output.append({
                        'topic_name': tk.topic_name,
                        'what_it_is': tk.what_it_is,
                        'what_you_will_learn': tk.what_you_will_learn or [],
                        'subtopics': tk.subtopics or [],
                        'validation_keywords': tk.validation_keywords or [],
                        'difficulty': tk.difficulty,
                        'benchmark_hours': float(tk.benchmark_hours),
                        'roadmap_id': tk.roadmap_id,
                        'score': 1.0 - distance,  # Convert distance to similarity
                    })

            return output

        except Exception as e:
            logger.warning(f"RAGEngine: ChromaDB topic query failed: {e}")
            return []

    # ─── Admin Wisdom ─────────────────────────────────────────────────────

    def query_admin_wisdom(
        self, topic_name: str, entry_text: str, n: int = 3
    ) -> List[str]:
        """
        Semantic retrieval of admin corrections from ChromaDB.
        Returns list of correction description strings.
        """
        if self.wisdom_collection.count() == 0:
            return []

        query_string = f"Topic: {topic_name}. Issue: {entry_text[:200]}. Admin previously corrected similar entries about this topic."

        try:
            results = self.wisdom_collection.query(
                query_texts=[query_string],
                n_results=n,
            )

            if not results or not results.get('documents') or not results['documents'][0]:
                return []

            corrections = []
            for i, doc in enumerate(results['documents'][0]):
                meta = results['metadatas'][0][i] if results.get('metadatas') else {}
                correction_type = meta.get('correction_type', 'unknown')
                topic = meta.get('topic_name', '?')
                corrections.append(
                    f"[{correction_type}] {topic}: {doc[:300]}"
                )

            return corrections

        except Exception as e:
            logger.warning(f"RAGEngine: ChromaDB wisdom query failed: {e}")
            return []

    def sync_wisdom(self, wisdom) -> None:
        """
        Upsert a GlobalWisdom instance into ChromaDB for future semantic retrieval.
        Called from Django post_save signal.
        """
        doc = (
            f"Topic: {wisdom.topic_name}. "
            f"Correction: {wisdom.admin_correction_reason}. "
            f"Entry was about: {wisdom.entry_text_snippet}. "
            f"AI said {wisdom.ai_original_decision}, admin changed to {wisdom.admin_corrected_decision}. "
            f"Type: {wisdom.get_correction_type_display()}."
        )
        self.wisdom_collection.upsert(
            ids=[f"wisdom_{wisdom.id}"],
            documents=[doc],
            metadatas=[{
                'correction_type': wisdom.correction_type,
                'topic_name': wisdom.topic_name,
                'ai_original': wisdom.ai_original_decision,
                'admin_corrected': wisdom.admin_corrected_decision,
                'created_at': str(wisdom.created_at),
            }],
        )
        logger.info(f"RAGEngine: Synced wisdom #{wisdom.id} for topic '{wisdom.topic_name}'")

    def bulk_load_wisdom(self) -> int:
        """Bulk load all existing GlobalWisdom entries into ChromaDB."""
        from .models import GlobalWisdom

        all_wisdom = GlobalWisdom.objects.all()
        count = 0
        batch_ids = []
        batch_docs = []
        batch_metas = []

        for w in all_wisdom.iterator():
            doc = (
                f"Topic: {w.topic_name}. "
                f"Correction: {w.admin_correction_reason}. "
                f"Entry was about: {w.entry_text_snippet}. "
                f"AI said {w.ai_original_decision}, admin changed to {w.admin_corrected_decision}. "
                f"Type: {w.get_correction_type_display()}."
            )
            batch_ids.append(f"wisdom_{w.id}")
            batch_docs.append(doc)
            batch_metas.append({
                'correction_type': w.correction_type,
                'topic_name': w.topic_name,
                'ai_original': w.ai_original_decision,
                'admin_corrected': w.admin_corrected_decision,
                'created_at': str(w.created_at),
            })
            count += 1

            if len(batch_ids) >= 10:
                self.wisdom_collection.upsert(
                    ids=batch_ids, documents=batch_docs, metadatas=batch_metas,
                )
                batch_ids, batch_docs, batch_metas = [], [], []

        if batch_ids:
            self.wisdom_collection.upsert(
                ids=batch_ids, documents=batch_docs, metadatas=batch_metas,
            )

        logger.info(f"RAGEngine: Bulk loaded {count} wisdom entries into ChromaDB")
        return count

    # ─── Health Check ─────────────────────────────────────────────────────

    def health_check(self) -> Dict[str, Any]:
        """Returns collection counts and connectivity status."""
        try:
            topic_count = self.topic_collection.count()
            wisdom_count = self.wisdom_collection.count()

            # Test embed connectivity
            embed_ok = False
            try:
                test = self.embed_fn(["test"])
                embed_ok = len(test) > 0
            except Exception:
                pass

            return {
                'status': 'ok',
                'topic_knowledge_count': topic_count,
                'admin_wisdom_count': wisdom_count,
                'embedding_model_ok': embed_ok,
            }
        except Exception as e:
            return {'status': 'error', 'error': str(e)}
