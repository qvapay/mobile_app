import 'package:flutter/material.dart';
import 'package:mobile_app/constants/constants.dart';
import 'package:mobile_app/modules/auth/login/login.dart';
import 'package:mobile_app/widgets/widgets.dart';

class LoginInitial extends StatefulWidget {
  const LoginInitial({Key? key}) : super(key: key);

  @override
  _LoginInitialState createState() => _LoginInitialState();
}

class _LoginInitialState extends State<LoginInitial> {
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
            'Log in',
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
              padding: const EdgeInsets.all(15),
              child: Column(
                children: <Widget>[
                  Center(
                    child: Padding(
                      padding: const EdgeInsets.all(25),
                      child: CircleAvatar(
                        backgroundColor: Colors.grey,
                        radius: 80,
                        child: Image.asset(
                          'assets/images/no_image.png',
                          height: 70,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(
                    height: 20,
                  ),
                  TextFormField(
                    controller: emailController,
                    decoration: const InputDecoration(
                        labelText: 'Correo electrónico',
                        labelStyle: kInputDecoration),
                    validator: (amount) => amount != null && amount.isEmpty
                        ? 'Este valor no puede estar vacío'
                        : null,
                  ),
                  const SizedBox(
                    height: 20,
                  ),
                  TextFormField(
                    obscureText: true,
                    decoration: InputDecoration(
                      suffix: TextButton(
                          onPressed: () {
                            /*Navigator.of(context).push<MaterialPageRoute>(
                              MaterialPageRoute(
                                builder: (_) => const RecoveryPassword(),
                              ),
                            )*/
                            ;
                          },
                          child: const Text(
                            'La Olvidaste?',
                            style: kInputDecorationSuffix,
                          )),
                      labelStyle: kInputDecoration,
                      labelText: 'Contraseña',
                    ),
                    controller: passController,
                    validator: (amount) => amount != null && amount.isEmpty
                        ? 'Este valor no puede estar vacío'
                        : null,
                  ),
                  const SizedBox(
                    height: 20,
                  ),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Text(
                        'Text to register.',
                        style: kInputDecoration,
                      ),
                      TextButton(
                          onPressed: () {
                            /*Navigator.of(context).push<MaterialPageRoute>(
                              MaterialPageRoute(
                                builder: (_) => const Register(),
                              ),
                            );*/
                          },
                          child: Text(
                            'Register',
                            style: kTitleScaffold.copyWith(fontSize: 14),
                          ))
                    ],
                  ),
                ],
              ),
            ),
          )),
          Padding(
            padding: const EdgeInsets.all(8),
            child: ButtonLarge(
              onClicked: () {
                Navigator.of(context).push<MaterialPageRoute>(
                  MaterialPageRoute(
                    builder: (_) => const Login(),
                  ),
                );
              },
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
