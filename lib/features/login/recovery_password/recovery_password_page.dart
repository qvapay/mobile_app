import 'package:flutter/material.dart';
import 'package:mobile_app/core/constants/widgets_constants.dart';
import 'package:mobile_app/core/widgets/button_large_widget.dart';

class RecoverPasswordPage extends StatelessWidget {
  const RecoverPasswordPage({Key? key}) : super(key: key);

  /// Returns a [MaterialPageRoute] to navigate to `this` widget.
  static Route go() {
    return MaterialPageRoute<void>(builder: (_) => const RecoverPasswordPage());
  }

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
                // key: _formKey,
                child: SingleChildScrollView(
                  physics: const BouncingScrollPhysics(),
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Cuál es tu correo electrónico?',
                          style: kHeaderRegister,
                        ),
                        const SizedBox(
                          height: 10,
                        ),
                        const Text(
                          'Te enviaremos un mensaje con un enlace de '
                          'recuperación.',
                          style: kBodyRegister,
                        ),
                        const SizedBox(
                          height: 180,
                        ),
                        TextFormField(
                          // controller: phoneController,
                          decoration: const InputDecoration(
                              labelText: 'Correo electrónico',
                              labelStyle: kInputDecoration),
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
                title: 'Enviar Mensaje',
                styleGradient: kLinearGradientBlue,
                active: true,
                onPressed: registerUser,
              ),
            )
          ],
        ));
  }

  void registerUser() {
    // if (_formKey.currentState!.validate()) {
    print('Is Validate');
    /*Navigator.of(context).push<MaterialPageRoute>(
        MaterialPageRoute(
          builder: (_) => const RecoveryPasswordConfirm(),
        ),
      );*/
    // }
  }
}
