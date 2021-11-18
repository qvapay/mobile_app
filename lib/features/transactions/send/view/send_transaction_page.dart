import 'package:flutter/material.dart';
import 'package:mobile_app/core/constants/constants.dart';
import 'package:mobile_app/features/transactions/widgets/header_transaction_deatails.dart';
import 'package:mobile_app/features/transactions/widgets/widgets.dart';

class SendTransactionPage extends StatelessWidget {
  const SendTransactionPage({Key? key}) : super(key: key);

  /// Returns a [MaterialPageRoute] to navigate to `this` widget.
  static Route go() {
    return MaterialPageRoute<void>(builder: (_) => const SendTransactionPage());
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    final qButtomWidth = size.width * 0.42;
    return Scaffold(
      backgroundColor: kbgPage,
      appBar: AppBar(
        title: const Text('Enviar Transacción',
            style: TextStyle(
              fontSize: 20,
              color: Color(0xFF3186E7),
              fontFamily: 'Roboto',
              fontWeight: FontWeight.w900,
            )),
        centerTitle: true,
        backgroundColor: kbgPage,
        elevation: 0,
        leading: IconButton(
          onPressed: () => Navigator.of(context).pop(),
          icon: const Icon(
            Icons.arrow_back_ios,
            color: kActiveText,
          ),
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: TextButton(
                onPressed: () {},
                child: const Text(
                  'Cancelar',
                  style: TextStyle(
                    fontSize: 16,
                    color: Color(0xFFBF461F),
                    fontFamily: 'Roboto',
                    fontWeight: FontWeight.w700,
                  ),
                )),
          )
        ],
      ),
      body: Column(
        children: [
          const Center(
            child: HeaderTransactionDeatails(
              name: 'Yeikel Uriarte',
              email: 'uyeikel@gmail.com',
              imageUrl: 'hello',
            ),
          ),
          SizedBox(height: size.height * 0.05),
          TextButton(
            onPressed: () => null,
            // context
            //     .read<ReceivePaymentCubit>()
            //     .changeVisibilityOfAmount(
            //       visibility: true,
            //       capture: false,
            //     ),
            child: const Text(
              'Entre la cantidad a enviar',
              style: TextStyle(
                fontSize: 21,
                fontFamily: 'Roboto',
                fontWeight: FontWeight.bold,
                color: Colors.black38,
              ),
            ),
          ),
          SizedBox(height: size.height * 0.05),
          QButtom(
            width: qButtomWidth,
            height: kToolbarHeight,
            styleGradient: kLinearGradientBlue,
            // icon: const Icon(
            //   Icons.switch_camera_rounded,
            //   color: Colors.white,
            // ),
            text: 'Monto Máximo',
            onPressed: () async {},
          ),
          // const Flexible(
          //   flex: 2,
          //   child: Padding(
          //     padding: EdgeInsets.symmetric(horizontal: 16, vertical: 16),
          //     child: TextField(
          //         style: TextStyle(fontSize: 18),
          //         decoration: InputDecoration(
          //           border: InputBorder.none,
          //           hintText: 'Entre la cantidad a enviar',
          //           hintStyle: TextStyle(color: Colors.black38),
          //         )),
          //   ),
          // ),
          SizedBox(height: size.height * 0.05),
          TextButton(
              onPressed: () {},
              child: const Text(
                '+ Agregar comentario',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              )),

          Expanded(child: Container()),
          Padding(
            padding: const EdgeInsets.all(16),
            child: QButtom(
              width: size.width,
              height: kToolbarHeight,
              styleGradient: kLinearGradientLargeGreen,
              // icon: const Icon(
              //   Icons.switch_camera_rounded,
              //   color: Colors.white,
              // ),
              text: 'Realizar Pago',
              onPressed: () {},
            ),
          ),
        ],
      ),
    );
  }
}
