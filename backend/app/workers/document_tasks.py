from app.workers.celery_app import celery_app
from app.workflow.graph import get_review_graph


@celery_app.task(name="app.workers.document_tasks.parse_document", bind=True, max_retries=1)
def parse_document(self, task_id: str, document_id: str, filename: str, file_path: str):
    try:
        graph = get_review_graph()
        initial_state = {
            "document_id": document_id,
            "review_task_id": task_id,
            "current_status": "parsing",
            "document_content": "",
            "document_metadata": {"filename": filename, "file_type": "", "page_count": 0, "ocr_quality_score": 0.0},
            "risk_items": [],
            "human_reviews": [],
            "assigned_reviewer_id": None,
            "vector_db_version": "v1.0.0",
            "decision_log": [],
            "completed_at": None,
        }
        thread_id = f"review-task-{task_id}"
        result = graph.invoke(initial_state, config={"configurable": {"thread_id": thread_id}})
        return {"status": "workflow_started", "task_id": task_id}
    except Exception as exc:
        raise self.retry(exc=exc, countdown=30)
