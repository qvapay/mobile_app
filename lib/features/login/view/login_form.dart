import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:formz/formz.dart';

import 'package:mobile_app/core/constants/constants.dart';
import 'package:mobile_app/core/formz/formz.dart';
import 'package:mobile_app/features/login/login.dart';
import 'package:mobile_app/features/login/widgets/widgets.dart';
import 'package:mobile_app/features/register/register.dart';

class LoginForm extends StatefulWidget {
  const LoginForm({Key? key}) : super(key: key);

  @override
  _LoginFormState createState() => _LoginFormState();
}

class _LoginFormState extends State<LoginForm> {
  @override
  Widget build(BuildContext context) {
    return BlocListener<LoginBloc, LoginState>(
      listener: (context, state) {
        if (state.status.isSubmissionFailure) {
          ScaffoldMessenger.of(context)
            ..hideCurrentSnackBar()
            ..showSnackBar(
              SnackBar(content: Text(state.messageError)),
            );
        }
      },
      child: Column(
        children: <Widget>[
          Expanded(
              child: SingleChildScrollView(
            physics: const BouncingScrollPhysics(),
            child: Padding(
              padding: const EdgeInsets.all(15),
              child: Column(
                children: <Widget>[
                  Center(
                    child: Padding(
                      padding: const EdgeInsets.all(25),
                      child: CircleAvatar(
                        backgroundColor: Colors.grey,
                        radius: 65,
                        child: Image.asset(
                          'assets/images/no_image.png',
                          height: 70,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(
                    height: 16,
                  ),
                  BlocBuilder<LoginBloc, LoginState>(
                    buildWhen: (previous, current) =>
                        previous.email != current.email,
                    builder: (context, state) {
                      final errorText = _getErrorText(state.email);
                      return TextField(
                        onChanged: (email) => context
                            .read<LoginBloc>()
                            .add(LoginEmailChanged(email)),
                        decoration: InputDecoration(
                          labelText: 'Correo electrónico',
                          labelStyle: kInputDecoration,
                          errorText: errorText,
                        ),
                      );
                    },
                  ),
                  const SizedBox(
                    height: 16,
                  ),
                  const PasswordTextFielWidget(),
                  const SizedBox(
                    height: 16,
                  ),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Text(
                        'No tengo cuenta.',
                        style: kInputDecoration,
                      ),
                      TextButton(
                          onPressed: () {
                            Navigator.of(context).pushAndRemoveUntil<void>(
                                RegisterPage.go(), (_) => false);
                          },
                          child: Text(
                            'Registrarme',
                            style: kTitleScaffold.copyWith(fontSize: 14),
                          ))
                    ],
                  ),
                ],
              ),
            ),
          )),
          const Padding(
            padding: EdgeInsets.all(4),
            child: LoginButtomSubmitted(),
          )
        ],
      ),
    );
  }

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
}
