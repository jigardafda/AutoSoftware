import { WebSocket } from 'ws';

interface Connection {
  socket: WebSocket;
  userId: string;
  subscriptions: Set<string>;
  lastHeartbeat: Date;
}

class ConnectionManager {
  private connections: Map<string, Connection> = new Map();
  private userConnections: Map<string, Set<string>> = new Map();
  private resourceSubscribers: Map<string, Set<string>> = new Map();

  addConnection(connectionId: string, socket: WebSocket, userId: string): void {
    this.connections.set(connectionId, {
      socket,
      userId,
      subscriptions: new Set(),
      lastHeartbeat: new Date(),
    });

    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set());
    }
    this.userConnections.get(userId)!.add(connectionId);
  }

  removeConnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    // Remove from user connections
    const userConns = this.userConnections.get(connection.userId);
    if (userConns) {
      userConns.delete(connectionId);
      if (userConns.size === 0) {
        this.userConnections.delete(connection.userId);
      }
    }

    // Remove from resource subscriptions
    for (const resource of connection.subscriptions) {
      const subscribers = this.resourceSubscribers.get(resource);
      if (subscribers) {
        subscribers.delete(connectionId);
        if (subscribers.size === 0) {
          this.resourceSubscribers.delete(resource);
        }
      }
    }

    this.connections.delete(connectionId);
  }

  subscribe(connectionId: string, resource: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    connection.subscriptions.add(resource);

    if (!this.resourceSubscribers.has(resource)) {
      this.resourceSubscribers.set(resource, new Set());
    }
    this.resourceSubscribers.get(resource)!.add(connectionId);
  }

  unsubscribe(connectionId: string, resource: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    connection.subscriptions.delete(resource);

    const subscribers = this.resourceSubscribers.get(resource);
    if (subscribers) {
      subscribers.delete(connectionId);
      if (subscribers.size === 0) {
        this.resourceSubscribers.delete(resource);
      }
    }
  }

  broadcast(resource: string, message: object): void {
    const subscribers = this.resourceSubscribers.get(resource);
    if (!subscribers) return;

    const payload = JSON.stringify(message);
    for (const connectionId of subscribers) {
      const connection = this.connections.get(connectionId);
      if (connection && connection.socket.readyState === WebSocket.OPEN) {
        connection.socket.send(payload);
      }
    }
  }

  broadcastToUser(userId: string, message: object): void {
    const connectionIds = this.userConnections.get(userId);
    if (!connectionIds) return;

    const payload = JSON.stringify(message);
    for (const connectionId of connectionIds) {
      const connection = this.connections.get(connectionId);
      if (connection && connection.socket.readyState === WebSocket.OPEN) {
        connection.socket.send(payload);
      }
    }
  }

  getOnlineUsers(): string[] {
    return Array.from(this.userConnections.keys());
  }

  getResourceViewers(resource: string): string[] {
    const subscribers = this.resourceSubscribers.get(resource);
    if (!subscribers) return [];

    const users = new Set<string>();
    for (const connectionId of subscribers) {
      const connection = this.connections.get(connectionId);
      if (connection) {
        users.add(connection.userId);
      }
    }
    return Array.from(users);
  }

  updateHeartbeat(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.lastHeartbeat = new Date();
    }
  }

  /**
   * Broadcast message to ALL connected clients
   */
  broadcastToAll(message: object): void {
    const payload = JSON.stringify(message);
    for (const connection of this.connections.values()) {
      if (connection.socket.readyState === WebSocket.OPEN) {
        connection.socket.send(payload);
      }
    }
  }

  /**
   * Get total number of connections
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Get user info for a given userId
   */
  getUserConnectionIds(userId: string): string[] {
    const connectionIds = this.userConnections.get(userId);
    return connectionIds ? Array.from(connectionIds) : [];
  }

  /**
   * Send message to a specific connection
   */
  sendToConnection(connectionId: string, message: object): void {
    const connection = this.connections.get(connectionId);
    if (connection && connection.socket.readyState === WebSocket.OPEN) {
      connection.socket.send(JSON.stringify(message));
    }
  }
}

export const connectionManager = new ConnectionManager();
