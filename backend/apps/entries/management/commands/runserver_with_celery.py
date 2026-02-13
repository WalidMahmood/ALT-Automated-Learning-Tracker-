"""
Custom management command: runserver_with_celery
Starts Django development server AND Celery worker together.

Usage:
    python manage.py runserver_with_celery
    python manage.py runserver_with_celery 0.0.0.0:8000
"""
import os
import sys
import signal
import subprocess
from django.core.management.base import BaseCommand
from django.core.management import call_command


class Command(BaseCommand):
    help = 'Run Django development server with Celery worker (auto-start both services)'

    def add_arguments(self, parser):
        parser.add_argument(
            'addrport', nargs='?', default='127.0.0.1:8000',
            help='Optional port number, or ipaddr:port'
        )

    def handle(self, *args, **options):
        addrport = options['addrport']
        
        self.stdout.write(self.style.SUCCESS('=' * 70))
        self.stdout.write(self.style.SUCCESS('  ALT System - Starting Django + Celery Worker'))
        self.stdout.write(self.style.SUCCESS('=' * 70))
        self.stdout.write('')
        
        # Start Celery worker in background
        celery_process = None
        try:
            self.stdout.write(self.style.WARNING('Starting Celery worker in background...'))
            
            # Windows-specific: use creationflags to hide window
            startupinfo = None
            creationflags = 0
            if sys.platform == 'win32':
                startupinfo = subprocess.STARTUPINFO()
                startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                creationflags = subprocess.CREATE_NO_WINDOW
            
            celery_process = subprocess.Popen(
                [sys.executable, '-m', 'celery', '-A', 'config', 'worker', 
                 '--loglevel=info', '--pool=solo', '--concurrency=1'],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                startupinfo=startupinfo,
                creationflags=creationflags,
                cwd=os.getcwd()
            )
            
            self.stdout.write(self.style.SUCCESS(f'✓ Celery worker started (PID: {celery_process.pid})'))
            self.stdout.write('')
            
            # Start Django runserver
            self.stdout.write(self.style.WARNING(f'Starting Django server on {addrport}...'))
            self.stdout.write(self.style.SUCCESS('✓ AI analysis will process automatically when entries are created'))
            self.stdout.write('')
            self.stdout.write(self.style.HTTP_INFO('Press CTRL+C to stop both services'))
            self.stdout.write(self.style.SUCCESS('=' * 70))
            self.stdout.write('')
            
            # Run Django server (blocking)
            call_command('runserver', addrport, '--noreload')
            
        except KeyboardInterrupt:
            self.stdout.write('')
            self.stdout.write(self.style.WARNING('Shutting down...'))
            
        finally:
            # Cleanup: kill Celery worker
            if celery_process:
                self.stdout.write(self.style.WARNING('Stopping Celery worker...'))
                try:
                    celery_process.terminate()
                    celery_process.wait(timeout=5)
                except:
                    celery_process.kill()
                self.stdout.write(self.style.SUCCESS('✓ Celery worker stopped'))
            
            self.stdout.write(self.style.SUCCESS('✓ All services stopped'))
