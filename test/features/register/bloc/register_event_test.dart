// ignore_for_file: prefer_const_constructors
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/register/register.dart';

import '../../../constants.dart';

void main() {
  group('RegisterEvent', () {
    group('RegisterNameChanged', () {
      test('supports value comparisons', () {
        expect(RegisterEmailChanged(tName), RegisterEmailChanged(tName));
      });
    });
    group('RegisterEmailChanged', () {
      test('supports value comparisons', () {
        expect(RegisterEmailChanged(tEmail), RegisterEmailChanged(tEmail));
      });
    });

    group('RegisterPasswordChanged', () {
      test('supports value comparisons', () {
        expect(
          RegisterPasswordChanged(tPassword),
          RegisterPasswordChanged(tPassword),
        );
      });
    });

    group('RegisterSubmitted', () {
      test('supports value comparisons', () {
        expect(RegisterSubmitted(), RegisterSubmitted());
      });
    });

    group('RegisterCompleteChanged', () {
      test('supports value comparisons', () {
        expect(RegisterCompleteChanged(), RegisterCompleteChanged());
      });
    });
  });
}
