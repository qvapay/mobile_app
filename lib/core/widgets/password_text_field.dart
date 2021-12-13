import 'package:flutter/material.dart';
import 'package:mobile_app/core/constants/constants.dart';
import 'package:mobile_app/core/formz/formz.dart';
import 'package:mobile_app/core/themes/colors.dart';

class PasswordTextFielWidget extends StatelessWidget {
  const PasswordTextFielWidget({
    Key? key,
    required this.onPasswordChanged,
    this.suffix,
    required this.password,
  }) : super(key: key);

  final void Function(String password) onPasswordChanged;
  final Widget? suffix;
  final PasswordFormz password;

  String? _getPasswordErrorText(PasswordFormz password) {
    if (password.invalid) {
      if (password.error == PasswordValidationError.invalid) {
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
      onChanged: onPasswordChanged,
      decoration: InputDecoration(
        border: const UnderlineInputBorder(
          borderSide: BorderSide(color: Colors.red, width: 5),
        ),
        errorText: passwordErrorText,
        suffix: suffix,
        labelStyle: const TextStyle(
          fontSize: 14,
          fontFamily: 'Roboto',
          fontWeight: FontWeight.bold,
          color: AppColors.textGrey,
        ),
        labelText: 'Contraseña',
      ),
    );
  }
}
