import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import 'package:mobile_app/authentication/authentication.dart';
import 'package:mobile_app/core/dependency_injection/dependency_injection.dart';
import 'package:mobile_app/features/register/bloc/register_bloc.dart';
import 'package:mobile_app/features/register/view/register_view.dart';

class RegisterPage extends StatelessWidget {
  const RegisterPage({Key? key}) : super(key: key);

  /// Returns a [MaterialPageRoute] to navigate to `this` widget.
  static Route go() {
    return MaterialPageRoute<void>(builder: (_) => const RegisterPage());
  }

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (context) => RegisterBloc(
        authenticationRepository: getIt<IAuthenticationRepository>(),
      ),
      child: const RegisterView(),
    );
  }
}
