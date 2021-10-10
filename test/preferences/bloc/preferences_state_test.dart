import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/preferences/preferences.dart';

void main() {
  group('PreferencesState', () {
    test('supports value comparison', () {
      expect(PreferencesInitial(), equals(PreferencesInitial()));
    });
  });
}
