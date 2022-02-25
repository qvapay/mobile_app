import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile_app/core/constants/constants.dart';
import 'package:mobile_app/core/widgets/widgets.dart';
import 'package:mobile_app/features/transactions/transactions.dart';
import 'package:mobile_app/features/user_data/user_data.dart';

class SendPaymentView extends StatelessWidget {
  const SendPaymentView({
    Key? key,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    final qButtomWidth = size.width * 0.42;
    const qButtomHeight = kToolbarHeight * 1.25;
    return Column(
      children: [
        Container(
          color: Theme.of(context).backgroundColor,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
            child: TextField(
                style: TextStyle(
                  fontSize: 18,
                  color: Theme.of(context).textTheme.headline1!.color,
                ),
                decoration: InputDecoration(
                  border: InputBorder.none,
                  prefixIcon: Icon(
                    Icons.search,
                    size: 32,
                    color: Theme.of(context).textTheme.headline1!.color,
                  ),
                  hintText: 'Escriba el nombre o correo',
                  hintStyle: TextStyle(
                    color: Theme.of(context).textTheme.headline1!.color,
                  ),
                )),
          ),
        ),
        Container(
          color: Theme.of(context).backgroundColor,
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: 16,
              vertical: 8,
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Contactos sugeridos',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: Theme.of(context).textTheme.headline1!.color,
                  ),
                ),
                Row(
                  children: [
                    TextButton(
                      onPressed: () {},
                      child: Text(
                        'Ver Todos',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          color: Theme.of(context).primaryColor,
                        ),
                      ),
                    ),
                    Icon(
                      Icons.arrow_forward_ios_sharp,
                      size: 16,
                      color: Theme.of(context).primaryColor,
                    )
                  ],
                )
              ],
            ),
          ),
        ),
        Expanded(
          child: ListView.builder(
            itemCount: 10,
            padding: const EdgeInsets.symmetric(horizontal: 4),
            itemBuilder: (context, index) => const UserServiceCardWidget(
              name: 'Martin Ekstrom',
              subtitle: 'email@gmail.com',
              avatar: 'assets/avatars/keanu.png',
            ),
          ),
        ),
        Container(
            color: Theme.of(context).backgroundColor,
            height: size.height * 0.25,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    QButtom(
                      width: qButtomWidth,
                      height: qButtomHeight,
                      styleGradient: kLinearGradientLargeGreen,
                      icon: const Icon(
                        Icons.done_all_rounded,
                        color: Colors.white,
                      ),
                      text: 'Enlace de Pago',
                      onPressed: () {},
                    ),
                    QButtom(
                      width: qButtomWidth,
                      height: qButtomHeight,
                      styleGradient: kLinearGradientBlue,
                      icon: const Icon(
                        Icons.people,
                        color: Colors.white,
                      ),
                      text: 'Contactos',
                      onPressed: () {
                        final transaction = UserTransaction(
                          uuid: 'c9667d83-87ed-4baa-b97c-716d233b5277',
                          amount: '1.0',
                          email: 'erich@qvapay.com',
                          description: 'Payment test form app',
                          name: 'Erich Garcia',
                          date: DateTime.now(),
                          imageUrl:
                              'https://qvapay.com/storage/profiles/xGnoyrlZMy10Ta5hCQGvEtj6aqJK3Fa1rueU1lPv.jpg',
                          transactionType: TransactionType.p2p,
                        );
                        Navigator.push<void>(
                          context,
                          SendTransactionPage.go(transaction: transaction),
                        );
                      },
                    ),
                  ],
                ),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    QButtom(
                      width: qButtomWidth,
                      height: qButtomHeight,
                      styleGradient: kLinearGradientBlue,
                      icon: const Icon(
                        Icons.qr_code_scanner,
                        color: Colors.white,
                      ),
                      text: 'Escanear QR',
                      onPressed: () => Navigator.push<void>(
                        context,
                        MaterialPageRoute<void>(
                          builder: (_) => BlocProvider.value(
                            value: context.read<SendTransactionCubit>(),
                            child: BlocProvider.value(
                              value: context.read<UserDataCubit>(),
                              child: const QrScanPage(),
                            ),
                          ),
                        ),
                      ),
                    ),
                    QButtom(
                      width: qButtomWidth,
                      height: qButtomHeight,
                      styleGradient: kLinearGradientBlue,
                      icon: const Icon(
                        Icons.person_sharp,
                        color: Colors.white,
                      ),
                      text: 'Usuario',
                      onPressed: () {},
                    ),
                  ],
                ),
              ],
            ))
      ],
    );
  }
}
