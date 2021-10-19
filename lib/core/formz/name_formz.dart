import 'package:formz/formz.dart';

enum NameValidationError { empty, invalid }

class NameFormz extends FormzInput<String, NameValidationError> {
  const NameFormz.pure() : super.pure('');
  const NameFormz.dirty([String value = '']) : super.dirty(value);

  static final RegExp _nameRegExp = RegExp(
    r'^[a-zA-Z0-9áéóíú_\-=@,\.;]+$',
  );

  @override
  NameValidationError? validator(String value) {
    if (value.isEmpty) return NameValidationError.empty;
    if (!_nameRegExp.hasMatch(value.replaceAll(' ', ''))) {
      return NameValidationError.invalid;
    }
    return null;
  }
}
