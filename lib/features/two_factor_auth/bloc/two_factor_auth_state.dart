part of 'two_factor_auth_bloc.dart';

abstract class TwoFactorAuthState extends Equatable {
  const TwoFactorAuthState();
  
  @override
  List<Object> get props => [];
}

class TwoFactorAuthInitial extends TwoFactorAuthState {}
