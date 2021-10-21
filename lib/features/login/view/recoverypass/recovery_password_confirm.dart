import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:qvapay_ui_test/constants/constants.dart';
import 'package:qvapay_ui_test/modules/auth/recoverypass/recovery_successfuly.dart';
import 'package:qvapay_ui_test/widgets/button_large.dart';

class RecoveryPasswordConfirm extends StatefulWidget {
  const RecoveryPasswordConfirm({Key? key}) : super(key: key);

  @override
  _RecoveryPasswordConfirmState createState() =>
      _RecoveryPasswordConfirmState();
}

class _RecoveryPasswordConfirmState extends State<RecoveryPasswordConfirm> {
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
                onClicked: recoveryPassword,
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
          builder: (_) => const RecoverySuccess(),
        ),
      );
    }
  }
}
