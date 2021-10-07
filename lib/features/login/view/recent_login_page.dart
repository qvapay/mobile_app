import 'package:flutter/material.dart';

class RecentLoginPage extends StatelessWidget {
  const RecentLoginPage({Key? key}) : super(key: key);

  /// Returns a [MaterialPageRoute] to navigate to `this` widget.
  static Route go() {
    return MaterialPageRoute<void>(builder: (_) => const RecentLoginPage());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text('Recent Login Page'),
            ElevatedButton(
              onPressed: () {},
              child: const Text('Recent Login Page'),
            )
          ],
        ),
      ),
    );
  }
}
