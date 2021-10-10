import 'package:formz/formz.dart';

enum PasswordValidationError { empty, invalid }

const passwordMinLength = 8;

class PasswordFormz extends FormzInput<String, PasswordValidationError> {
  const PasswordFormz.pure() : super.pure('');
  const PasswordFormz.dirty([String value = '']) : super.dirty(value);

  @override
  PasswordValidationError? validator(String value) {
    if (value.isEmpty) return PasswordValidationError.empty;
    if (value.length < passwordMinLength) {
      return PasswordValidationError.invalid;
    }
    return null;
  }
}
