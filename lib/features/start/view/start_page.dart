import 'package:flutter/material.dart';
import 'package:mobile_app/features/login/login.dart';

class StartPage extends StatelessWidget {
  const StartPage({Key? key}) : super(key: key);

  /// Returns a [MaterialPageRoute] to navigate to `this` widget.
  static Route go() {
    return MaterialPageRoute<void>(builder: (_) => const StartPage());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text('Start Page'),
            ElevatedButton(
              child: const Text('Go To LoginPage'),
              onPressed: () {
                Navigator.of(context).pushAndRemoveUntil<void>(
                  LoginPage.go(),
                  (route) => false,
                );
              },
            )
          ],
        ),
      ),
    );
  }
}
