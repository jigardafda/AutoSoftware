// Service Worker for Push Notifications
// This file handles incoming push events and displays notifications

self.addEventListener("push", function (event) {
  if (!event.data) {
    console.log("Push event but no data");
    return;
  }

  try {
    const data = event.data.json();

    const options = {
      body: data.body || data.message || "You have a new notification",
      icon: data.icon || "/logo.svg",
      badge: data.badge || "/favicon.svg",
      vibrate: [100, 50, 100],
      data: data.data || {},
      actions: data.actions || [],
      tag: data.tag || "notification",
      renotify: true,
    };

    event.waitUntil(
      self.registration.showNotification(data.title || "AutoSoftware", options)
    );
  } catch (error) {
    console.error("Error processing push notification:", error);
  }
});

// Handle notification click
self.addEventListener("notificationclick", function (event) {
  event.notification.close();

  const data = event.notification.data;
  let url = "/notifications";

  // Navigate based on notification data
  if (data.url) {
    url = data.url;
  } else if (data.taskId) {
    url = `/tasks/${data.taskId}`;
  } else if (data.scanId) {
    url = `/scans/${data.scanId}`;
  } else if (data.projectId) {
    url = `/projects/${data.projectId}`;
  }

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
      // Check if there's already a window open
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if ("focus" in client) {
          return client.focus().then(function (windowClient) {
            if (windowClient.navigate) {
              return windowClient.navigate(url);
            }
          });
        }
      }
      // If no window is open, open a new one
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// Handle notification close
self.addEventListener("notificationclose", function (event) {
  // Could track analytics here if needed
  console.log("Notification closed:", event.notification.tag);
});
