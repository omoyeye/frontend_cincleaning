export const NotificationService = {
    sendSMS: async (to: string, message: string) => {
        // MOCK SMS SENDING
        console.log(`[SMS to ${to}]: ${message}`);
        // In production, integration with Twilio or Brevo would go here
        return true;
    },

    sendPush: async (userId: string, title: string, body: string) => {
        // MOCK PUSH NOTIFICATION
        console.log(`[PUSH to ${userId}]: ${title} - ${body}`);
        // Web Push API integration would go here
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, { body });
        }
        return true;
    }
};

export const requestNotificationPermission = async () => {
    if ('Notification' in window) {
        await Notification.requestPermission();
    }
};
