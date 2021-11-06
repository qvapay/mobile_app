import 'package:formz/formz.dart';

enum AmountValidationError { empty, invalid }

class AmountFormz extends FormzInput<String, AmountValidationError> {
  const AmountFormz.pure() : super.pure('');
  const AmountFormz.dirty([String value = '']) : super.dirty(value);

  static final RegExp _nameRegExp = RegExp(
    r'^[0-9,.]+$',
  );

  @override
  AmountValidationError? validator(String value) {
    if (value.isEmpty) return AmountValidationError.empty;
    if (!_nameRegExp.hasMatch(value.replaceAll(' ', ''))) {
      return AmountValidationError.invalid;
    }
    return null;
  }
}
