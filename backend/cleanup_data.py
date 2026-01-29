import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.topics.models import Topic, LearnerTopicMastery
from apps.training_plans.models import TrainingPlan, PlanTopic, PlanAssignment
from apps.entries.models import Entry

def cleanup():
    print("Starting database cleanup...")
    
    # Delete Entries
    print("Deleting all Entries...")
    Entry.objects.all().delete()
    
    # Delete Training Plan related
    print("Deleting all Plan Assignments...")
    PlanAssignment.objects.all().delete()
    
    print("Deleting all Plan Topics...")
    PlanTopic.objects.all().delete()
    
    print("Deleting all Training Plans...")
    TrainingPlan.objects.all().delete()
    
    # Delete Topic related
    print("Deleting all Learner Topic Masteries...")
    LearnerTopicMastery.objects.all().delete()
    
    print("Deleting all Topics...")
    Topic.objects.all().delete()
    
    print("Cleanup complete!")

if __name__ == "__main__":
    cleanup()
