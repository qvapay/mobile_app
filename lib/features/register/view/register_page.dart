import 'package:flutter/material.dart';
import 'package:mobile_app/features/login/login.dart';

class RegisterPage extends StatelessWidget {
  const RegisterPage({Key? key}) : super(key: key);

  /// Returns a [MaterialPageRoute] to navigate to `this` widget.
  static Route go() {
    return MaterialPageRoute<void>(builder: (_) => const RegisterPage());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text('Register Page'),
            ElevatedButton(
              onPressed: () {
                Navigator.of(context).pushAndRemoveUntil<void>(
                  LoginPage.go(),
                  (_) => false,
                );
              },
              child: const Text('Go to Login'),
            )
          ],
        ),
      ),
    );
  }
}
