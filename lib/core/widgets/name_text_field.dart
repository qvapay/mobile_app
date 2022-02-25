import 'package:flutter/material.dart';
import 'package:mobile_app/core/constants/constants.dart';
import 'package:mobile_app/core/formz/formz.dart';

class NameTextFielWidget extends StatelessWidget {
  const NameTextFielWidget({
    Key? key,
    required this.onNameChanged,
    this.suffix,
    required this.password,
  }) : super(key: key);

  final void Function(String password) onNameChanged;
  final Widget? suffix;
  final NameFormz password;

  String? _getPasswordErrorText(NameFormz password) {
    if (password.invalid) {
      if (password.error == NameValidationError.invalid) {
        return 'Debe contener 8 caracteres';
      } else {
        return 'Este campo no puede estar vacío';
      }
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final passwordErrorText = _getPasswordErrorText(password);
    return TextField(
      obscureText: true,
      onChanged: onNameChanged,
      decoration: InputDecoration(
        errorText: passwordErrorText,
        suffix: suffix,
        labelStyle: kInputDecoration,
        labelText: 'Contraseña',
      ),
    );
  }
}
