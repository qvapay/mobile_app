import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:formz/formz.dart';

import 'package:mobile_app/core/constants/constants.dart';
import 'package:mobile_app/core/widgets/widgets.dart';
import 'package:mobile_app/features/login/login.dart';

class LoginButtomSubmitted extends StatelessWidget {
  const LoginButtomSubmitted({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<LoginBloc, LoginState>(
      buildWhen: (previous, current) => previous.status != current.status,
      builder: (context, state) {
        final isValid = state.status.isValid;
        return state.status.isSubmissionInProgress
            ? const CircularProgressIndicator()
            : ButtonLarge(
                onClicked: () =>
                    context.read<LoginBloc>().add(const LoginSubmitted()),
                title: 'Iniciar Sesión',
                styleGradient:
                    isValid ? kLinearGradientBlue : kLinearGradientGrey,
                active: isValid,
              );
      },
    );
  }
}
