import 'package:flutter/material.dart';
import 'package:mobile_app/core/constants/constants.dart';
import 'package:mobile_app/core/formz/formz.dart';

class EmailTextFieldWidget extends StatelessWidget {
  const EmailTextFieldWidget({
    Key? key,
    required this.email,
    required this.onEmailChanged,
  }) : super(key: key);

  final EmailFormz email;
  final void Function(String password) onEmailChanged;

  String? _getErrorText(EmailFormz email) {
    if (email.invalid) {
      if (email.error == EmailValidationError.invalid) {
        return 'Correo inválido';
      } else {
        return 'Este campo no puede estar vacío';
      }
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final errorText = _getErrorText(email);
    return TextField(
      onChanged: onEmailChanged,
      decoration: InputDecoration(
        labelText: 'Correo electrónico',
        labelStyle: kInputDecoration,
        errorText: errorText,
      ),
    );
  }
}
