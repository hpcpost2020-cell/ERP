from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django.utils import timezone

from .models import Task
from .serializers import TaskSerializer, TaskListSerializer


class TaskViewSet(viewsets.ModelViewSet):
    queryset = Task.objects.select_related('assigned_to', 'created_by').all()
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'priority', 'assigned_to', 'related_model']
    search_fields = ['title', 'description', 'related_label', 'related_id']
    ordering_fields = ['due_date', 'priority', 'created_at', 'status']
    ordering = ['due_date', '-priority']

    def get_serializer_class(self):
        if self.action == 'list':
            return TaskListSerializer
        return TaskSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=False, methods=['get'], url_path='my-tasks')
    def my_tasks(self, request):
        """Tasks assigned to the current user that are open or in progress."""
        tasks = Task.objects.filter(
            assigned_to=request.user,
            status__in=[Task.STATUS_OPEN, Task.STATUS_IN_PROGRESS]
        ).select_related('assigned_to', 'created_by').order_by('due_date', '-priority')
        return Response(TaskListSerializer(tasks, many=True).data)

    @action(detail=False, methods=['get'], url_path='overdue')
    def overdue(self, request):
        """Tasks past their due date that are not done or cancelled."""
        tasks = Task.objects.filter(
            due_date__lt=timezone.now(),
            status__in=[Task.STATUS_OPEN, Task.STATUS_IN_PROGRESS]
        ).select_related('assigned_to', 'created_by').order_by('due_date')
        return Response(TaskListSerializer(tasks, many=True).data)

    @action(detail=True, methods=['post'], url_path='complete')
    def complete(self, request, pk=None):
        task = self.get_object()
        if task.status == Task.STATUS_DONE:
            return Response({'detail': 'Task is already marked as done.'}, status=status.HTTP_400_BAD_REQUEST)
        task.status = Task.STATUS_DONE
        task.completed_at = timezone.now()
        task.save(update_fields=['status', 'completed_at', 'updated_at'])
        return Response(TaskSerializer(task).data)

    @action(detail=True, methods=['post'], url_path='assign')
    def assign(self, request, pk=None):
        task = self.get_object()
        user_id = request.data.get('user_id')
        if user_id:
            from django.contrib.auth import get_user_model
            User = get_user_model()
            try:
                task.assigned_to = User.objects.get(pk=user_id)
            except User.DoesNotExist:
                return Response({'detail': 'User not found.'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            task.assigned_to = request.user
        task.save(update_fields=['assigned_to', 'updated_at'])
        return Response(TaskSerializer(task).data)
