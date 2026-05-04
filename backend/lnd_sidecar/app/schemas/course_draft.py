from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from decimal import Decimal
from datetime import datetime

class MentorAssignmentDraft(BaseModel):
    mentor_id: int
    hours_taught: Decimal
    amount_paid: Decimal

class CourseDraftCreate(BaseModel):
    mentor_assignments: Optional[List[MentorAssignmentDraft]] = None
    food_cost: Optional[Decimal] = None
    other_cost: Optional[Decimal] = None
    draft_data: Optional[Dict[str, Any]] = None

class CourseDraftUpdate(BaseModel):
    mentor_assignments: Optional[List[MentorAssignmentDraft]] = None
    food_cost: Optional[Decimal] = None
    other_cost: Optional[Decimal] = None
    draft_data: Optional[Dict[str, Any]] = None

class CourseDraftResponse(BaseModel):
    id: int
    course_id: int
    mentor_assignments: Optional[List[Dict[str, Any]]] = None
    food_cost: Optional[Decimal] = None
    other_cost: Optional[Decimal] = None
    draft_data: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

