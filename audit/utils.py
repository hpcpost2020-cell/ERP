from .models import AuditLog


def log_action(request, action, model_name, object_id, object_repr, changes):
    ip = request.META.get('REMOTE_ADDR') if request else None
    AuditLog.objects.create(
        user=request.user if request and request.user.is_authenticated else None,
        action=action,
        model_name=model_name,
        object_id=str(object_id),
        object_repr=str(object_repr)[:255],
        changes=changes or {},
        ip_address=ip,
    )
