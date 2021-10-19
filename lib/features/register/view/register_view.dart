import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:formz/formz.dart';

import 'package:mobile_app/core/constants/constants.dart';
import 'package:mobile_app/features/register/register.dart';
import 'package:mobile_app/features/register/view/register_form.dart';
import 'package:mobile_app/features/register/view/register_last.dart';
import 'package:mobile_app/features/register/view/register_success.dart';

class RegisterView extends StatelessWidget {
  const RegisterView({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return BlocListener<RegisterBloc, RegisterState>(
      listener: (context, state) {
        if (state.status.isSubmissionFailure) {
          ScaffoldMessenger.of(context)
            ..hideCurrentSnackBar()
            ..showSnackBar(
              SnackBar(content: Text(state.messageError)),
            );
        }
      },
      child: Scaffold(
        appBar: AppBar(
          title: const Center(
            child: Text(
              'Registro',
              style: kTitleScaffold,
            ),
          ),
          elevation: 0,
          backgroundColor: Colors.transparent,
        ),
        body: BlocBuilder<RegisterBloc, RegisterState>(
          builder: (context, state) {
            if (state.status.isSubmissionSuccess && !state.complete) {
              return const RegisterLast();
            }
            if (state.complete) {
              return const RegisterSuccessView();
            }
            return const RegisterForm();
          },
        ),
      ),
    );
  }
}
