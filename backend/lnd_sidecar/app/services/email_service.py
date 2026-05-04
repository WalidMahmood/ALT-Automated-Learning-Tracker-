"""Email service for sending class reminders."""
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from typing import Optional
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

class EmailService:
    """Service for sending emails."""
    
    @staticmethod
    def is_enabled() -> bool:
        """Check if email is enabled and configured."""
        return bool(
            settings.SMTP_ENABLED and
            settings.SMTP_HOST and
            settings.SMTP_USER and
            settings.SMTP_PASSWORD and
            settings.SMTP_FROM_EMAIL
        )
    
    @staticmethod
    def send_email(
        to_email: str,
        subject: str,
        body: str,
        html_body: Optional[str] = None
    ) -> bool:
        """
        Send an email.
        
        Args:
            to_email: Recipient email address
            subject: Email subject
            body: Plain text email body
            html_body: Optional HTML email body
            
        Returns:
            True if email was sent successfully, False otherwise
        """
        if not EmailService.is_enabled():
            logger.warning("Email service is not enabled or not configured. Skipping email send.")
            return False
        
        try:
            # Create message
            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject
            msg['From'] = settings.SMTP_FROM_EMAIL
            msg['To'] = to_email
            
            # Add plain text part
            text_part = MIMEText(body, 'plain')
            msg.attach(text_part)
            
            # Add HTML part if provided
            if html_body:
                html_part = MIMEText(html_body, 'html')
                msg.attach(html_part)
            
            # Send email
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                if settings.SMTP_USE_TLS:
                    server.starttls()
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.send_message(msg)
            
            logger.info(f"Email sent successfully to {to_email}: {subject}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to send email to {to_email}: {str(e)}")
            return False
    
    @staticmethod
    def send_class_reminder(
        admin_email: str,
        course_name: str,
        batch_code: str,
        class_time: datetime,
        start_time: str,
        end_time: str,
        day: str
    ) -> bool:
        """
        Send a class reminder email to the admin.
        
        Args:
            admin_email: Admin email address
            course_name: Name of the course
            batch_code: Batch code
            class_time: DateTime of the class
            start_time: Start time (HH:MM format)
            end_time: End time (HH:MM format)
            day: Day of the week
            
        Returns:
            True if email was sent successfully, False otherwise
        """
        # Format the class time
        time_str = class_time.strftime("%B %d, %Y at %I:%M %p")
        
        subject = f"Class Reminder: {course_name} ({batch_code}) - {time_str}"
        
        # Plain text body
        body = f"""
Class Reminder

You have a class scheduled:

Course: {course_name}
Batch: {batch_code}
Day: {day}
Time: {start_time} - {end_time}
Date: {time_str}

This is a reminder that the class will start in {settings.REMINDER_MINUTES_BEFORE} minutes.

Please ensure you are prepared for the class.
        """.strip()
        
        # HTML body
        html_body = f"""
        <html>
          <body>
            <h2>Class Reminder</h2>
            <p>You have a class scheduled:</p>
            <ul>
              <li><strong>Course:</strong> {course_name}</li>
              <li><strong>Batch:</strong> {batch_code}</li>
              <li><strong>Day:</strong> {day}</li>
              <li><strong>Time:</strong> {start_time} - {end_time}</li>
              <li><strong>Date:</strong> {time_str}</li>
            </ul>
            <p><strong>This is a reminder that the class will start in {settings.REMINDER_MINUTES_BEFORE} minutes.</strong></p>
            <p>Please ensure you are prepared for the class.</p>
          </body>
        </html>
        """
        
        return EmailService.send_email(
            to_email=admin_email,
            subject=subject,
            body=body,
            html_body=html_body
        )

