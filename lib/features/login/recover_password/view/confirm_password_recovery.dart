import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

import 'package:mobile_app/core/constants/constants.dart';
import 'package:mobile_app/core/widgets/widgets.dart';
import 'package:mobile_app/features/login/recover_password/view/satisfactory_recovery.dart';

class ConfirmPasswordRecovery extends StatefulWidget {
  const ConfirmPasswordRecovery({Key? key}) : super(key: key);

  @override
  _ConfirmPasswordRecoveryState createState() =>
      _ConfirmPasswordRecoveryState();
}

class _ConfirmPasswordRecoveryState extends State<ConfirmPasswordRecovery> {
  final _formKey = GlobalKey<FormState>();
  final oldPassController = TextEditingController();
  final newPassController = TextEditingController();
  final confirmNewPassController = TextEditingController();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
        appBar: AppBar(
          title: const Center(
            child: Text(
              'Olvidé mi Contraseña',
              style: kTitleScaffold,
            ),
          ),
          elevation: 0,
          backgroundColor: const Color(0xFFFFFFFF),
        ),
        body: Column(
          children: <Widget>[
            Expanded(
              child: Form(
                key: _formKey,
                child: SingleChildScrollView(
                  physics: const BouncingScrollPhysics(),
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const SizedBox(
                          height: 20,
                        ),
                        const Text(
                          'Nueva contraseña',
                          style: kHeaderRegister,
                        ),
                        const SizedBox(
                          height: 10,
                        ),
                        const Text(
                          'Introduce los datos que necesitamos a continuación '
                          'para recuperar la cuenta.',
                          style: kBodyRegister,
                        ),
                        const SizedBox(
                          height: 50,
                        ),
                        const SizedBox(
                          height: 10,
                        ),
                        TextFormField(
                          obscureText: true,
                          decoration: const InputDecoration(
                            labelStyle: kInputDecoration,
                            labelText: 'Contraseña anterior',
                          ),
                          controller: oldPassController,
                          validator: (amount) =>
                              amount != null && amount.isEmpty
                                  ? 'Este valor no puede estar vacío'
                                  : null,
                        ),
                        const SizedBox(
                          height: 10,
                        ),
                        TextFormField(
                          obscureText: true,
                          decoration: const InputDecoration(
                            labelStyle: kInputDecoration,
                            labelText: 'Contraseña nueva',
                          ),
                          controller: newPassController,
                          validator: (amount) =>
                              amount != null && amount.isEmpty
                                  ? 'Este valor no puede estar vacío'
                                  : null,
                        ),
                        const SizedBox(
                          height: 10,
                        ),
                        TextFormField(
                          obscureText: true,
                          decoration: const InputDecoration(
                            labelStyle: kInputDecoration,
                            labelText: 'Confirmar la contraseña nueva',
                          ),
                          controller: confirmNewPassController,
                          validator: (amount) =>
                              amount != null && amount.isEmpty
                                  ? 'Este valor no puede estar vacío'
                                  : null,
                        ),
                        const SizedBox(
                          height: 20,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Text(
                  'Ya eres miembro?.',
                  style: kInputDecoration,
                ),
                TextButton(
                    onPressed: () {},
                    child: Text(
                      'Inicia Sesión',
                      style: kTitleScaffold.copyWith(fontSize: 14),
                    ))
              ],
            ),
            Padding(
              padding: const EdgeInsets.all(8),
              child: ButtonLarge(
                title: 'Registrarse',
                styleGradient: kLinearGradientBlue,
                active: true,
                onPressed: recoveryPassword,
              ),
            )
          ],
        ));
  }

  void recoveryPassword() {
    if (_formKey.currentState!.validate()) {
      print('Is Validate');
      Navigator.of(context).push<MaterialPageRoute>(
        MaterialPageRoute(
          builder: (_) => const SatisfactoryRecovery(),
        ),
      );
    }
  }
}
