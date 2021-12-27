import 'dart:async';
import 'package:flutter/foundation.dart';

class Debouncer {
  Debouncer({required this.duration});

  final Duration duration;
  VoidCallback? action;
  Timer? _timer;

  void run(VoidCallback action) {
    if (_timer != null) {
      _timer?.cancel();
    }
    _timer = Timer(duration, action);
  }
}
