import 'dart:async';

/// Class that provides information about current connection status.
abstract class NetworkInfo {
  FutureOr<bool> get isConnected;
}
