import io
import pandas as pd
from typing import List, Dict, Any
from fastapi.responses import StreamingResponse

def create_excel_response(data: List[Dict[str, Any]], filename: str, sheet_name: str) -> StreamingResponse:
    """Helper to create Excel response from data."""
    df = pd.DataFrame(data)
    
    # Ensure columns exist even if data is empty (basic columns)
    if df.empty and not data:
        # We can't easily guess columns without data, but usually the caller handles empty data logic 
        # or we just return an empty sheet.
        pass

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, sheet_name=sheet_name, index=False)
        
        # Auto-adjust column widths
        worksheet = writer.sheets[sheet_name]
        from openpyxl.utils import get_column_letter
        for idx, col in enumerate(df.columns):
            max_length = max(
                df[col].astype(str).map(len).max() if not df.empty else 0,
                len(str(col))
            )
            column_letter = get_column_letter(idx + 1)
            worksheet.column_dimensions[column_letter].width = min(max_length + 2, 50)
    
    output.seek(0)
    
    return StreamingResponse(
        io.BytesIO(output.read()),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
