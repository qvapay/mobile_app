import 'package:flutter/material.dart';

void main() {
  runApp(QvaPayApp());
}

class QvaPayApp extends StatelessWidget {
  // This widget is the root of your application.
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'QvaPay',
      theme: ThemeData(
        primarySwatch: Colors.blue,
      ),
      home: InitPage(),
    );
  }
}

class InitPage extends StatelessWidget {
  const InitPage({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        child: Center(
          child: Text(
            'QvaPay',
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
          ),
        ),
      ),
    );
  }
}
