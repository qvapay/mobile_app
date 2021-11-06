import 'package:intl/intl.dart';

extension ToFormat on DateTime {
  /// Change format to 8/28/22021
  String format() {
    return DateFormat.yMd().format(this).toString();
  }
}

extension ToDouble on String {
  /// Parse [String] as an double literal and return its value
  double toDouble() {
    return double.parse(this);
  }
}
