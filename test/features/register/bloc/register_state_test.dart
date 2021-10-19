import 'package:flutter_test/flutter_test.dart';
import 'package:formz/formz.dart';
import 'package:mobile_app/core/formz/formz.dart';
import 'package:mobile_app/features/register/register.dart';

import '../../../constants.dart';

void main() {
  const tNameFormz = NameFormz.dirty(tName);
  const tEmailFormz = EmailFormz.dirty(tEmail);
  const tPasswordFromz = PasswordFormz.dirty(tPassword);
  group('RegisterState', () {
    test('supports value comparisons', () {
      expect(const RegisterState(), const RegisterState());
    });

    test('returns same object when no properties are passed', () {
      expect(const RegisterState().copyWith(), const RegisterState());
    });

    test('returns object with updated status when status is passed', () {
      expect(
        const RegisterState().copyWith(status: FormzStatus.pure),
        const RegisterState(),
      );
    });

    test('returns object with updated name when name is passed', () {
      expect(
        const RegisterState().copyWith(name: tNameFormz),
        const RegisterState(name: tNameFormz),
      );
    });

    test('returns object with updated email when email is passed', () {
      expect(
        const RegisterState().copyWith(email: tEmailFormz),
        const RegisterState(email: tEmailFormz),
      );
    });

    test('returns object with updated password when password is passed', () {
      expect(
        const RegisterState().copyWith(password: tPasswordFromz),
        const RegisterState(password: tPasswordFromz),
      );
    });

    test('returns object with updated referralCode when referralCode is passed',
        () {
      expect(
        const RegisterState().copyWith(referralCode: tReferralCode),
        const RegisterState(referralCode: tReferralCode),
      );
    });

    test('returns object with updated messageError when messageError is passed',
        () {
      expect(
        const RegisterState().copyWith(messageError: tEmailMessageError),
        const RegisterState(messageError: tEmailMessageError),
      );
    });

    test('returns object with updated complete when complete is passed', () {
      expect(
        const RegisterState().copyWith(complete: true),
        const RegisterState(complete: true),
      );
    });
  });
}
