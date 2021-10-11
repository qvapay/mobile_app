import 'package:flutter/material.dart';
import 'package:mobile_app/core/constants/widgets_constants.dart';
import 'package:mobile_app/core/widgets/button_large_widget.dart';
import 'package:mobile_app/features/register/view/register_last.dart';

class RegisterForm extends StatefulWidget {
  const RegisterForm({Key? key}) : super(key: key);

  @override
  _RegisterFormState createState() => _RegisterFormState();
}

class _RegisterFormState extends State<RegisterForm> {
  final _formKey = GlobalKey<FormState>();
  final nameController = TextEditingController();
  final emailController = TextEditingController();
  final passController = TextEditingController();
  @override
  Widget build(BuildContext context) {
    return Column(
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
                      'Una nueva experiencia!',
                      style: kHeaderRegister,
                    ),
                    const SizedBox(
                      height: 10,
                    ),
                    const Text(
                      'Introduce los datos que necesitamos a continuación '
                      'para completar tu registro.',
                      style: kBodyRegister,
                    ),
                    const SizedBox(
                      height: 50,
                    ),
                    TextFormField(
                      controller: nameController,
                      decoration: const InputDecoration(
                          labelText: 'Nombre y Apellidos',
                          labelStyle: kInputDecoration),
                      validator: (amount) => amount != null && amount.isEmpty
                          ? 'Este valor no puede estar vacío'
                          : null,
                    ),
                    const SizedBox(
                      height: 10,
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
                      height: 10,
                    ),
                    TextFormField(
                      obscureText: true,
                      decoration: const InputDecoration(
                        labelStyle: kInputDecoration,
                        labelText: 'Contraseña',
                      ),
                      controller: passController,
                      validator: (amount) => amount != null && amount.isEmpty
                          ? 'Este valor no puede estar vacío'
                          : null,
                    ),
                    const SizedBox(
                      height: 10,
                    ),
                    TextFormField(
                      controller: nameController,
                      decoration: const InputDecoration(
                          labelText: 'Código de Referido',
                          labelStyle: kInputDecoration),
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
                  ],
                ),
              ),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(8),
          child: ButtonLarge(
            title: 'Registrarse',
            styleGradient: kLinearGradientBlue,
            active: true,
            onClicked: registerUser,
          ),
        )
      ],
    );
  }

  void registerUser() {
    if (_formKey.currentState!.validate()) {
      print('Is Validate');
      Navigator.of(context).push<MaterialPageRoute>(
        MaterialPageRoute(
          builder: (_) => const RegisterLast(),
        ),
      );
    }
  }
}
