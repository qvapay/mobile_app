import 'package:flutter/material.dart';

import 'package:mobile_app/core/constants/widgets_constants.dart';
import 'package:mobile_app/core/widgets/button_large_widget.dart';
import 'package:mobile_app/features/login/login.dart';

class RegisterSuccessView extends StatelessWidget {
  const RegisterSuccessView({Key? key}) : super(key: key);

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
                      backgroundColor: Colors.white,
                      radius: 80,
                      child: Image.asset(
                        'assets/avatars/success_register.png',
                        height: 160,
                        width: 160,
                      ),
                    ),
                  ),
                ),
                const SizedBox(
                  height: 60,
                ),
                const Text(
                  'Registro',
                  style: kHeaderRegisterLast,
                ),
                const Text(
                  'completado!',
                  style: kHeaderRegisterLast,
                ),
                const SizedBox(
                  height: 10,
                ),
                const Text(
                  'Ahora inicia sesión para comenzar a usar '
                  'la aplicación',
                  style: kBodyRegister,
                ),
              ],
            ),
          ),
        )),
        Padding(
          padding: const EdgeInsets.all(8),
          child: ButtonLarge(
            onPressed: () => Navigator.of(context).pushAndRemoveUntil<void>(
              LoginPage.go(),
              (route) => false,
            ),
            title: 'Iniciar Sesión',
            styleGradient: kLinearGradientBlue,
            active: true,
          ),
        )
      ],
    );
  }
}
