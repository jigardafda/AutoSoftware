import { useWebSocket } from '@/lib/websocket';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';

export function ConnectionIndicator() {
  const { isConnected, isReconnecting } = useWebSocket();

  if (isReconnecting) {
    return (
      <div className="flex items-center gap-2 text-yellow-500 text-sm">
        <RefreshCw className="w-4 h-4 animate-spin" />
        <span>Reconnecting...</span>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="flex items-center gap-2 text-red-500 text-sm">
        <WifiOff className="w-4 h-4" />
        <span>Disconnected</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-green-500 text-sm">
      <Wifi className="w-4 h-4" />
      <span>Live</span>
    </div>
  );
}
