import 'package:flutter/material.dart';
import 'package:mobile_app/core/constants/widgets_constants.dart';
import 'package:mobile_app/core/widgets/button_large_widget.dart';

class RegisterSuccess extends StatefulWidget {
  const RegisterSuccess({Key? key}) : super(key: key);

  @override
  _RegisterSuccessState createState() => _RegisterSuccessState();
}

class _RegisterSuccessState extends State<RegisterSuccess> {
  @override
  void dispose() {
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Center(
          child: Text(
            'Registro',
            style: kTitleScaffold,
          ),
        ),
        elevation: 0,
        backgroundColor: const Color(0xFFFFFFFF),
      ),
      body: Column(
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
              onClicked: () {},
              title: 'Iniciar Sesión',
              styleGradient: kLinearGradientBlue,
              active: true,
            ),
          )
        ],
      ),
    );
  }
}
