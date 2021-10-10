// ignore_for_file: prefer_const_constructors
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/login/login.dart';

void main() {
  const email = 'mock-email';
  const password = 'mock-password';
  group('LoginEvent', () {
    group('LoginEmailChanged', () {
      test('supports value comparisons', () {
        expect(LoginEmailChanged(email), LoginEmailChanged(email));
      });
    });

    group('LoginPasswordChanged', () {
      test('supports value comparisons', () {
        expect(LoginPasswordChanged(password), LoginPasswordChanged(password));
      });
    });

    group('LoginSubmitted', () {
      test('supports value comparisons', () {
        expect(LoginSubmitted(), LoginSubmitted());
      });
    });
  });
}
