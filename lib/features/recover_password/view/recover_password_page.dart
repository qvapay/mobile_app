import 'package:flutter/material.dart';

class RecoverPasswordPage extends StatelessWidget {
  const RecoverPasswordPage({Key? key}) : super(key: key);

  /// Returns a [MaterialPageRoute] to navigate to `this` widget.
  static Route go() {
    return MaterialPageRoute<void>(builder: (_) => const RecoverPasswordPage());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text('Signin Page'),
            ElevatedButton(onPressed: () {}, child: const Text('Signin Page'))
          ],
        ),
      ),
    );
  }
}
