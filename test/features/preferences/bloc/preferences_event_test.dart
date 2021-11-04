import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/preferences/preferences.dart';

import '../../../constants.dart';

void main() {
  group('PreferencesEvent', () {
    group('GetPreferences', () {
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
