import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import 'package:mobile_app/core/constants/widgets_constants.dart';
import 'package:mobile_app/core/widgets/widgets.dart';
import 'package:mobile_app/features/register/register.dart';

class RegisterLast extends StatelessWidget {
  const RegisterLast({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Column(
      children: <Widget>[
        Expanded(
            child: SingleChildScrollView(
          physics: const BouncingScrollPhysics(),
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Center(
                  child: Padding(
                    padding: const EdgeInsets.all(25),
                    child: CircleAvatar(
                      backgroundColor: Colors.grey,
                      radius: 70,
                      child: Image.asset(
                        'assets/avatars/letter_register.png',
                        height: 150,
                        width: 150,
                      ),
                    ),
                  ),
                ),
                const SizedBox(
                  height: 70,
                ),
                const Text(
                  'Ultimo paso!',
                  style: kHeaderRegisterLast,
                ),
                const SizedBox(
                  height: 10,
                ),
                const Text(
                  'Te hemos enviado un enlace de verificación a tu '
                  'correo electrónico',
                  style: kBodyRegister,
                ),
                const SizedBox(
                  height: 10,
                ),
              ],
            ),
          ),
        )),
        Padding(
          padding: const EdgeInsets.all(8),
          child: ButtonLarge(
            onPressed: () {
              //   return Navigator.of(context).pushAndRemoveUntil<void>(
              //   LoginPage.go(),
              //   (route) => false,
              // );
              context.read<RegisterBloc>().add(const RegisterCompleteChanged());
            },
            title: 'Sigiente',
            styleGradient: kLinearGradientBlue,
            active: true,
          ),
        )
      ],
    );
  }
}
