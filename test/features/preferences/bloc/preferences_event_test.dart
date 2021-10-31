import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/preferences/preferences.dart';

void main() {
  group('PreferencesEvent', () {
    group('GetPreferences', () {
      final tDate = DateTime.parse('2021-12-16T00:12:00.000');
      test('supports value comparisons', () {
        expect(GetPreferences(date: tDate), GetPreferences(date: tDate));
      });
    });

    group('CleanPreferences', () {
      test('supports value comparisons', () {
        expect(CleanPreferences(), CleanPreferences());
      });
    });
  });
}
