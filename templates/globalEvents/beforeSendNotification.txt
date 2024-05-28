function beforeSendNotification(notification) {
    if ("DOCUMENT_APPROVAL_PENDING" == notification.eventType) {
        notification.priority = "HIGH";
    }
}
