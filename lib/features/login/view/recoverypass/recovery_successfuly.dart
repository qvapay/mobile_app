import 'package:flutter/material.dart';
import 'package:qvapay_ui_test/constants/constants.dart';
import 'package:qvapay_ui_test/widgets/button_large.dart';

class RecoverySuccess extends StatefulWidget {
  const RecoverySuccess({Key? key}) : super(key: key);

  @override
  _RecoverySuccessState createState() => _RecoverySuccessState();
}

class _RecoverySuccessState extends State<RecoverySuccess> {
  //final _formKey = GlobalKey<FormState>();
  final emailController = TextEditingController();
  final passController = TextEditingController();

  @override
  void dispose() {
    emailController.dispose();
    passController.dispose();
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
                  const SizedBox(
                    height: 20,
                  ),
                  Center(
                    child: Padding(
                      padding: const EdgeInsets.all(25),
                      child: CircleAvatar(
                        backgroundColor: Colors.white,
                        radius: 80,
                        child: Image.asset(
                          'assets/avatars/recovery_pass.png',
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
                    'Has recuperado tu cuenta!',
                    style: kHeaderRegister,
                  ),
                  const SizedBox(
                    height: 10,
                  ),
                  const Text(
                    'Ahora inicia sesión para continuar usando la '
                    'aplicación',
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
