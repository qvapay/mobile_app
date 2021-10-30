import 'package:equatable/equatable.dart';
import 'package:hydrated_bloc/hydrated_bloc.dart';
import 'package:mobile_app/core/error/failures.dart';
import 'package:mobile_app/features/user_data/models/models.dart';
import 'package:mobile_app/features/user_data/repository/user_data_repository.dart';

part 'user_data_state.dart';

class UserDataCubit extends HydratedCubit<UserDataState> {
  UserDataCubit({
    required IUserDataRepository userDataRepository,
  })  : _userDataRepository = userDataRepository,
        super(const UserDataState());

  final IUserDataRepository _userDataRepository;

  Future<void> getUserData() async {
    final result = await _userDataRepository.getUserData(
        saveDateLastLogIn: DateTime.now());

    emit(
      result.fold(
        (l) => state.copyWith(errorMessaje: (l as ServerFailure).message),
        (userData) {
          return UserDataState(userData: userData);
        },
      ),
    );
  }

  @override
  UserDataState? fromJson(Map<String, dynamic> json) {
    if (json.isEmpty) return null;
    return UserDataState(userData: UserData.fromJson(json));
  }

  @override
  Map<String, dynamic>? toJson(UserDataState state) {
    if (state.userData != null) {
      return state.userData?.toJson();
    }
    return <String, dynamic>{};
  }
}
