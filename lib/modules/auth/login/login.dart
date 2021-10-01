import 'package:flutter/material.dart';
import 'package:mobile_app/constants/constants.dart';
import 'package:mobile_app/widgets/widgets.dart';

class Login extends StatefulWidget {
  const Login({Key? key}) : super(key: key);

  @override
  _LoginState createState() => _LoginState();
}

class _LoginState extends State<Login> {
  final _formKey = GlobalKey<FormState>();
  final passController = TextEditingController();
  @override
  void dispose() {
    super.dispose();
    passController.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
        body: Column(
      children: <Widget>[
        Expanded(
          child: Form(
            key: _formKey,
            child: SingleChildScrollView(
              physics: const BouncingScrollPhysics(),
              child: Column(
                children: [
                  const HeaderAuth(),
                  const SizedBox(
                    height: 50,
                  ),
                  Padding(
                    padding: const EdgeInsets.all(20),
                    child: TextFormField(
                      obscureText: true,
                      decoration: InputDecoration(
                        suffix: TextButton(
                            onPressed: () {
                              /*Navigator.of(context).push<MaterialPageRoute>(
                                MaterialPageRoute(
                                  builder: (_) => const RecoveryPassword(),
                                ),
                              );*/
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
                  ),
                  const SizedBox(
                    height: 20,
                  ),
                  TextButton(
                      onPressed: () {
                        /*Navigator.of(context).push<MaterialPageRoute>(
                          MaterialPageRoute(
                            builder: (_) => const AdminSaldo(),
                          ),
                        );*/
                      },
                      child: Text(
                        'Entrar con otra cuenta',
                        style: kTitleScaffold.copyWith(fontSize: 14),
                      ))
                ],
              ),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(8),
          child: ButtonLarge(
            onClicked: loginUser,
            title: 'Iniciar Sesión',
            styleGradient: kLinearGradientBlue,
            active: true,
          ),
        )
      ],
    ));
  }

  void loginUser() {
    if (_formKey.currentState!.validate()) {
      debugPrint('Frm Valid');
      /*Navigator.of(context).push<MaterialPageRoute>(
        MaterialPageRoute(
          builder: (_) => const LoginDoubleFactor(),
        ),
      );*/
    }
  }
}
