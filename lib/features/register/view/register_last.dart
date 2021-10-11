import 'package:flutter/material.dart';
import 'package:mobile_app/core/constants/widgets_constants.dart';

class RegisterLast extends StatefulWidget {
  const RegisterLast({Key? key}) : super(key: key);

  @override
  _RegisterLastState createState() => _RegisterLastState();
}

class _RegisterLastState extends State<RegisterLast> {
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
                ],
              ),
            ),
          )),
        ],
      ),
    );
  }
}
