import 'package:flutter/material.dart';
import 'package:mobile_app/features/services/models/services.dart';

class ServicesList extends StatelessWidget {
  const ServicesList({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        elevation: 0,
        title: const Text(
          'Mis Cuentas',
        ),
      ),
      body: Column(
        children: [
          Expanded(
              child: ListView.builder(
            itemCount: ServicesDataStatic.dataServices.length,
            itemBuilder: (context, index) => GestureDetector(
              onTap: () {}, //INSIDE A WRAP TO SEE SMALL CARD
              child: ServicesDataStatic.dataServices[index],
            ),
          ))
        ],
      ),
    );
  }
}
