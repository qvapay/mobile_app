import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile_app/core/constants/constants.dart';
import 'package:mobile_app/core/formz/formz.dart';
import 'package:mobile_app/features/login/login.dart';

class PasswordTextFielWidget extends StatelessWidget {
  const PasswordTextFielWidget({Key? key}) : super(key: key);

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
    return BlocBuilder<LoginBloc, LoginState>(
      buildWhen: (previous, current) => previous.password != current.password,
      builder: (context, state) {
        final passwordErrorText = _getPasswordErrorText(state.password);
        return TextField(
          obscureText: true,
          onChanged: (password) =>
              context.read<LoginBloc>().add(LoginPasswordChanged(password)),
          decoration: InputDecoration(
            errorText: passwordErrorText,
            suffix: TextButton(
                onPressed: () {
                  /*Navigator.of(context).push<void>(
                      PasswordRecovery.go()
                      ),
                    )*/
                },
                child: const Text(
                  'La Olvidaste?',
                  style: kInputDecorationSuffix,
                )),
            labelStyle: kInputDecoration,
            labelText: 'Contraseña',
          ),
        );
      },
    );
  }
}
