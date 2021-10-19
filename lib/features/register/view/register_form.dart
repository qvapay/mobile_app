import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:formz/formz.dart';
import 'package:mobile_app/core/constants/widgets_constants.dart';
import 'package:mobile_app/core/widgets/button_large_widget.dart';
import 'package:mobile_app/core/widgets/email_text_fiel.dart';
import 'package:mobile_app/core/widgets/password_text_field.dart';
import 'package:mobile_app/features/login/login.dart';
import 'package:mobile_app/features/register/register.dart';

class RegisterForm extends StatelessWidget {
  const RegisterForm({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Column(
      children: <Widget>[
        Expanded(
          child: SingleChildScrollView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            physics: const BouncingScrollPhysics(),
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SizedBox(
                    height: 20,
                  ),
                  const Text(
                    'Una nueva experiencia!',
                    style: kHeaderRegister,
                  ),
                  const SizedBox(
                    height: 10,
                  ),
                  const Text(
                    'Introduce los datos que necesitamos a continuación '
                    'para completar tu registro.',
                    style: kBodyRegister,
                  ),
                  const SizedBox(
                    height: 50,
                  ),
                  BlocBuilder<RegisterBloc, RegisterState>(
                    builder: (context, state) {
                      return TextFormField(
                        onChanged: (name) => context
                            .read<RegisterBloc>()
                            .add(RegisterNameChanged(name)),
                        decoration: const InputDecoration(
                          labelText: 'Nombre y Apellidos',
                          labelStyle: kInputDecoration,
                        ),
                      );
                    },
                  ),
                  const SizedBox(
                    height: 10,
                  ),
                  BlocBuilder<RegisterBloc, RegisterState>(
                    builder: (context, state) {
                      return EmailTextFieldWidget(
                          email: state.email,
                          onEmailChanged: (email) => context
                              .read<RegisterBloc>()
                              .add(RegisterEmailChanged(email)));
                    },
                  ),
                  const SizedBox(
                    height: 10,
                  ),
                  BlocBuilder<RegisterBloc, RegisterState>(
                    builder: (context, state) {
                      return PasswordTextFielWidget(
                        onPasswordChanged: (password) => context
                            .read<RegisterBloc>()
                            .add(RegisterPasswordChanged(password)),
                        password: state.password,
                      );
                    },
                  ),
                  const SizedBox(
                    height: 10,
                  ),
                  BlocBuilder<RegisterBloc, RegisterState>(
                    builder: (context, state) {
                      return TextField(
                        onChanged: (referralCode) => context
                            .read<RegisterBloc>()
                            .add(RegisterReferralCodeChanged(referralCode)),
                        decoration: const InputDecoration(
                          labelText: 'Código de Referido',
                          labelStyle: kInputDecoration,
                        ),
                      );
                    },
                  ),
                  const SizedBox(
                    height: 20,
                  ),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Text(
                        '¿Ya eres miembro?',
                        style: kInputDecoration,
                      ),
                      TextButton(
                          onPressed: () =>
                              Navigator.of(context).pushAndRemoveUntil<void>(
                                LoginPage.go(),
                                (route) => false,
                              ),
                          child: Text(
                            'Inicia Sesión',
                            style: kTitleScaffold.copyWith(fontSize: 14),
                          ))
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(8),
          child: BlocBuilder<RegisterBloc, RegisterState>(
            builder: (context, state) {
              final isValid = state.status.isValid;
              return state.status.isSubmissionInProgress
                  ? const CircularProgressIndicator()
                  : ButtonLarge(
                      title: 'Registrarse',
                      styleGradient:
                          isValid ? kLinearGradientBlue : kLinearGradientGrey,
                      active: isValid,
                      onPressed: () {
                        context.read<RegisterBloc>().add(
                              const RegisterSubmitted(),
                            );
                      },
                    );
            },
          ),
        )
      ],
    );
  }
}
